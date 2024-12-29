// Get local testing data from .env if it exists
const local = process.env.LOCAL_TEST ? process.env.LOCAL_TEST : false;
const localData = {
    "api-url": process.env.URL,
    "api-key": process.env.KEY,
    tag: process.env.TAG,
    tagPost: process.env.TAG_POST,
    field: process.env.FIELD,
    value: process.env.VALUE,
    days: process.env.DAYS,
};

/* eslint-disable no-console */
if (local) {
    console.log("Running with local config");
} else {
    console.log("Running as action");
}

const core = require("@actions/core");
const GhostAdminApi = require("@tryghost/admin-api");

// Get either the local or remote value
// depending on configuration
const getConfigData = (name) => {
    if (local && localData[name]) return localData[name];
    return core.getInput(name);
};

// Convert boolean strings to true booleans
const getValue = () => {
    let value = getConfigData("value");

    if (value === "true") {
        value = true;
    } else if (value === "false") {
        value = false;
    }

    return value;
};

const calculateDaysSince = (date) => {
    const now = new Date();
    const then = new Date(date);

    return Math.round((now - then) / (1000 * 60 * 60 * 24));
};

(async function main() {
    try {
        const api = new GhostAdminApi({
            url: getConfigData("api-url"),
            key: getConfigData("api-key"),
            version: "canary",
        });

        const tag = getConfigData("tag");
        const field = getConfigData("field");
        const value = getValue();
        const days = getConfigData("days");

        // Get all posts matching the tag
        const matchingPosts = await api.posts.browse({
            filter: `tag:${tag}+status:published`,
        });
        // Pair down posts to only ones that are past the days
        // configured by the workflow
        const posts = matchingPosts.filter((post, index) => {
            const differenceInDays = calculateDaysSince(post.published_at);

            console.log(
                `Post "${post.title}" published ${differenceInDays} days ago`
            );

            if (differenceInDays > days) {
                console.log(`Post ${post.title} is ready to be made public!`);
                return post;
            }

            console.log(
                `Post ${post.title} has ${
                    days - differenceInDays + 1
                } day(s) to go.`
            );
            return false;
        });

        if (posts.length === 0) {
            console.log("No posts to be updated.");
        }

        // Save the post IDs for
        // republishing later
        const postIDs = posts.map((post) => post.id);

        await Promise.all(
            posts.map(async (post) => {
                // Assign the new field value from
                // the workflow
                post[field] = value;
                // Set the post status to draft to "unpublish it"
                post["status"] = "draft";
                console.log(
                    `Updating post "${post.title}" ${field} to ${value}`
                );
                // Edit the posts and unpublish them
                await api.posts.edit(post);
            })
        );

        const idFilter = postIDs.map((id) => `id:${id}`).join(",");
        // Get the posts that were just unpublished with the saved IDs
        // Ensure only draft posts are used
        const unpublishedPosts = await api.posts.browse({
            filter: `${idFilter}+status:draft`,
        });

        await Promise.all(
            unpublishedPosts.map(async (post) => {
                post["status"] = "published";
                console.log(
                    `Republishing post "${post.title}" with announcement`
                );
                // Edit the posts and unpublish them
                await api.posts.edit(post, {
                    newsletter: "default-newsletter",
                    email_segment: "status:free",
                });
            })
        );
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();

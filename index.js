// Get local testing data from .env if it exists
const local = process.env.LOCAL_TEST ? process.env.LOCAL_TEST : false;
const localData = {
    "api-url": process.env.URL,
    "api-key": process.env.KEY,
    tag: process.env.TAG,
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

        const posts = await api.posts.browse({ filter: `tag:${tag}` });

        await Promise.all(
            posts.map(async (post) => {
                const differenceInDays = calculateDaysSince(post.published_at);

                console.log(
                    `Post "${post.title}" published ${differenceInDays} days ago`
                );

                // If enough days have passed, we will update the post
                if (differenceInDays > days) {
                    post[field] = value;
                    console.log(`Updating post "${post.title}"`);
                    await api.posts.edit(post);
                } else {
                    console.log(
                        `Not updating post "${post.title}", ${
                            days - differenceInDays + 1
                        } days to go`
                    );
                }
            })
        );
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();

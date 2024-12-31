// Get local testing data from .env if it exists
const local = process.env.LOCAL_TEST ? process.env.LOCAL_TEST : false;
const localData = {
    'api-url': process.env.URL,
    'api-key': process.env.KEY,
    tag: process.env.TAG,
    tagPost: process.env.TAG_POST,
    field: process.env.FIELD,
    value: process.env.VALUE,
    days: process.env.DAYS
};

// Function to remove a tag by its slug
const removeTag = (tagToRemove, tags) => {
    return tags.filter((tag) => {
        return tag.slug !== tagToRemove;
    });
};

/* eslint-disable no-console */
if (local) {
    console.log('Running with local config');
} else {
    console.log('Running as action');
}

const core = require('@actions/core');
const GhostAdminApi = require('@tryghost/admin-api');

// Get either the local or remote value
// depending on configuration
const getConfigData = (name) => {
    if (local && localData[name]) {
        return localData[name];
    }
    return core.getInput(name);
};

// Convert boolean strings to true booleans
const getValue = () => {
    let value = getConfigData('value');

    if (value === 'true') {
        value = true;
    } else if (value === 'false') {
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
            url: getConfigData('api-url'),
            key: getConfigData('api-key'),
            version: 'canary'
        });

        const tag = getConfigData('tag');
        const tagPost = getConfigData('tagPost');
        const field = getConfigData('field');
        const value = getValue();
        const days = getConfigData('days');

        // Get all posts matching the tag
        const matchingPosts = await api.posts.browse({
            filter: `tag:${tag}+status:published`
        });
        // Pair down posts to only ones that are past the days
        // configured by the workflow
        const posts = matchingPosts.filter((post) => {
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
            console.log('No posts to be updated.');
        }

        await Promise.all(
            posts.map(async (post) => {
                // Assign the new field value from
                // the workflow
                post[field] = value;

                // Filter out the tag used to find posts
                // so the post is no longer found by this script
                const newTags = removeTag(tag, post.tags);

                // Make a new tags array (slugs only) including an optional published-tag
                // to keep track of posts that have been made public
                const tagSlugs = [
                    ...newTags.map((tagObject) => {
                        return tagObject.slug;
                    }),
                    tagPost
                ];

                // Replace the post tags with the new array
                post.tags = tagSlugs;

                console.log(
                    `Updating post "${post.title}" ${field} to ${value}`
                );
                // Edit the posts and unpublish them
                await api.posts.edit(post);

                // Afterwards, create new email only posts to
                // announce the post updates
                const announcementPost = await api.posts.add(
                    {
                        title: `${post.title} is now available for all readers!`,
                        status: 'draft',
                        feature_image: post.feature_image,
                        html: `<p>Today! <a href="${post.url}">You too can read this post.</a></p>`,
                        email_only: true
                    },
                    {
                        source: 'html'
                    }
                );

                // Publish the announcement post and send
                // an email
                announcementPost.status = 'published';
                await api.posts.edit(announcementPost, {
                    newsletter: 'default-newsletter',
                    email_segment: 'status:free'
                });
            })
        );
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();

// disAllowChannelArray.js


/**
 * Checks if the given channel ID is one of the disallowed channels for the bot to listen to.
 * @param {string} channelID - The channel ID to check.
 * @returns {boolean} true if the channel is disallowed, false otherwise.
 */
const disAllowChannelArray =  (channelID) => {
    const arr =  [
        // admin
        "1366743865402593342", //admin-chat
        "1366740176843440261", //mod-only
        "1366797560169103390", //log
        "1367472969101869151", //spin-test
        "1367749010663931938", //resource-requirement
        // announcement
        "1366749878536896523", //server-guideline
        "1366820002107228301", //region-map
        "1366820238670430359" //clan-info
    ];
    return arr.indexOf(channelID) !== -1;
}

// --- Command Export ---
module.exports = { disAllowChannelArray };
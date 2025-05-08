// drawCanvas.js

// You need to install the 'canvas' library: npm install canvas
const { createCanvas, loadImage } = require('canvas');
const moment = require('moment-timezone'); // Install moment-timezone: npm install moment-timezone

/**
 * Draws the user's bag contents onto a canvas and returns an image buffer.
 * @param {Array<Object>} itemsArray - An array of grouped item objects (e.g., [{ emoji: '🍎', name: 'Apple', amount: 5 }]).
 * @param {string} username - The username to display on the canvas.
 * @returns {Promise<Buffer>} A promise that resolves with the image buffer.
 */
const drawBagImage = async (itemsArray, username) => {
    // Define base dimensions for the canvas. Adjust as needed based on expected item count.
    // We'll calculate the height dynamically based on the number of items.
    const baseWidth = 700; // Increased width slightly for 5 items
    const itemHeight = 60; // Approximate height needed for each item row
    const padding = 20; // Padding around the edges
    const itemsPerRow = 5; // Number of items to display per row - Changed to 5
    const headerHeight = 40; // Height for the header text
    const footerHeight = 20; // Height for the date/time text

    // Sort items by name in ascending order
    const sortedItems = [...itemsArray].sort((a, b) => a.name.localeCompare(b.name));

    // Calculate the number of rows needed based on sorted items
    const numRows = Math.ceil(sortedItems.length / itemsPerRow);
    // Calculate the total height based on the number of rows, header, footer, and padding
    const canvasHeight = padding * 2 + headerHeight + numRows * itemHeight + footerHeight;

    // Create a canvas with calculated dimensions
    const canvas = createCanvas(baseWidth, Math.max(canvasHeight, 200 + headerHeight + footerHeight)); // Ensure minimum height
    const context = canvas.getContext('2d');

    // Set background color
    context.fillStyle = '#2f3136'; // Discord dark mode background color
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the header text
    context.font = '24px sans-serif';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.fillText(`Here is ${username||'XX'}'s Bag`, canvas.width / 2, padding + 24); // Position header text

    // Set text properties for item names and amounts
    context.font = '16px sans-serif'; // Choose a readable font
    context.fillStyle = '#ffffff'; // White text color
    context.textAlign = 'left'; // Align text to the left

    // Calculate item spacing and size
    const itemWidth = (baseWidth - padding * 2) / itemsPerRow;

    // Draw each item from the sorted array
    sortedItems.forEach((item, index) => {
        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;

        // Calculate x and y position for the item, accounting for the header
        const x = padding + col * itemWidth;
        const y = padding + headerHeight + row * itemHeight; // Adjusted y position

        // Draw item emoji (as text). Note: Rendering color emojis reliably
        // on server-side canvas can be complex and depends on system fonts.
        // It might appear as monochrome text.
        context.font = '16px sans-serif'; // Match font size for emoji
        context.fillText(item.emoji, x, y + 20); // Draw emoji

        // Draw item name
        context.font = '16px sans-serif'; // Font size updated to 16px
        context.fillText(item.name, x + 25, y + 20); // Draw name next to emoji (adjusted x slightly)

        // Draw item amount
        context.font = '14px sans-serif'; // Slightly smaller font for amount
        context.fillStyle = '#b9bbbe'; // Lighter color for amount
        context.fillText(`x${item.amount}`, x + 25, y + 40); // Draw amount below name (adjusted x and y)

        context.fillStyle = '#ffffff'; // Reset color for next item name
    });

    // Draw the date and time at the bottom
    const now = moment().tz('Asia/Bangkok'); // Get current time in GMT+7 (Asia/Bangkok timezone)
    const dateTimeString = now.format('YYYY-MM-DD HH:mm:ss [GMT+7]'); // Format the date and time

    context.font = '12px sans-serif'; // Smaller font for the footer
    context.fillStyle = '#b9bbbe'; // Lighter color for the footer text
    context.textAlign = 'right'; // Align text to the right
    // Position the text near the bottom right corner
    context.fillText(dateTimeString, canvas.width - padding, canvas.height - padding + 12);


    // Return the image buffer
    return canvas.toBuffer('image/png');
};

module.exports = { drawBagImage }; // Export the function

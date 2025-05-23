const fs = require("fs");
const path = require("path");

const CACHE_DIR = "./cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getCachedUserBag = async (userId) => {
  const filePath = path.join(CACHE_DIR, `bag_${userId}.json`);

  if (!fs.existsSync(filePath)) return null;

  const stats = fs.statSync(filePath);
  const now = Date.now();

  // Expire old cache
  if (now - stats.mtimeMs > CACHE_TTL_MS) return null;

  const raw = fs.readFileSync(filePath);
  return JSON.parse(raw);
};

const saveUserBagCache = (userId, data) => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
  }
  const filePath = path.join(CACHE_DIR, `bag_${userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const deleteUserBagCache = async (userId) => {
  const filePath = path.join(CACHE_DIR, `bag_${userId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[Cache] Deleted bag cache for user ${userId}`);
    return true;
  }
  return false;
};

module.exports = {
  getCachedUserBag,
  saveUserBagCache,
  deleteUserBagCache,
};

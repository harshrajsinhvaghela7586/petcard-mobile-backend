import MobileUser from "../models/MobileUser.js";
import { clampInt, escapeRegex, normalizeSearch } from "../utils/validators.js";

const PAGE_SIZE = 10;
const MAX_PAGE = 100_000;

export const getAdminUsers = async (req, res, next) => {
  try {
    const page = clampInt(req.query.page, { min: 1, max: MAX_PAGE, fallback: 1 });
    const search = normalizeSearch(req.query.search);

    const filter = {};

    if (search) {
      // User input is escaped and length-capped before it becomes a RegExp.
      const searchRegex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }];
    }

    const [users, totalUsers, verifiedUsers] = await Promise.all([
      MobileUser.find(filter)
        .select("_id name email phone isEmailVerified createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      MobileUser.countDocuments(filter),
      MobileUser.countDocuments({ ...filter, isEmailVerified: true }),
    ]);

    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

    return res.json({
      success: true,
      users,
      stats: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
      },
      pagination: {
        page,
        limit: PAGE_SIZE,
        totalUsers,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    return next(error);
  }
};

import MobileUser from "../models/MobileUser.js";

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getAdminUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = 10;
    const search = String(req.query.search || "").trim();

    const filter = {};

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");

      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    const [users, totalUsers, verifiedUsers, unverifiedUsers] =
      await Promise.all([
        MobileUser.find(filter)
          .select("_id name email phone isEmailVerified createdAt")
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        MobileUser.countDocuments(filter),
        MobileUser.countDocuments({
          ...filter,
          isEmailVerified: true,
        }),
        MobileUser.countDocuments({
          ...filter,
          isEmailVerified: false,
        }),
      ]);

    const totalPages = Math.ceil(totalUsers / limit);

    return res.json({
      success: true,
      users,
      stats: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
      },
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};
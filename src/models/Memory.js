import mongoose from "mongoose";

const memorySchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: "Pet", required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "MobileUser", required: true },

    title: { type: String, default: "", maxlength: 100 },
    caption: { type: String, default: "", maxlength: 1000 },
    date: { type: String, required: true }, // YYYY-MM-DD
    photo: {
      type: new mongoose.Schema(
        {
          publicId: { type: String, required: true, maxlength: 200 },
          url: { type: String, required: true, maxlength: 500 },
          width: { type: Number, min: 1, max: 20000 },
          height: { type: Number, min: 1, max: 20000 },
          format: { type: String, maxlength: 10 },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true, strictQuery: true }
);

memorySchema.index({ pet: 1, date: -1, _id: -1 });
memorySchema.index({ createdAt: -1, _id: -1 });

const Memory = mongoose.models.Memory || mongoose.model("Memory", memorySchema);
export default Memory;

const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    aiScore: { type: Number, required: true, min: 0, max: 100 },
    aiGeneratedProbability: { type: Number, required: true, min: 0, max: 1 },
    finalScore: { type: Number, required: true, min: 0, max: 100 },
    explanation: { type: String, required: true },
    username: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    source: { type: String, default: "extension" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);


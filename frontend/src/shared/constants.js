export const palette = ["coral", "blue", "gold", "violet", "green", "pink"];

export const reactionEmojis = ["👏", "🔥", "😂", "🤯", "❤️", "👍"];

export const questionTypeLabels = {
  single: "Single choice",
  multi: "Multiple choice",
  order: "Drag to order",
  matching: "Matching pairs",
};

export const blankQuestion = () => ({
  text: "",
  type: "single",
  options: ["", ""],
  match_options: [],
  correct_options: [0],
  time_limit_sec: 20,
  points: 1000,
});

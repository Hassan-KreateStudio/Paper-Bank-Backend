const usernameAdjectives = [
  "brave",
  "bright",
  "calm",
  "clever",
  "mint",
  "paper",
  "quiet",
  "sharp",
  "sunny",
  "swift"
];

const usernameNouns = [
  "atlas",
  "beam",
  "fox",
  "ink",
  "lion",
  "otter",
  "quill",
  "river",
  "spark",
  "trail"
];

const randomItem = <T>(items: T[]) => {
  return items[Math.floor(Math.random() * items.length)]!;
};

const randomSuffix = () => {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
};

export const generatePlayfulReviewerUsername = () => {
  return `${randomItem(usernameAdjectives)}-${randomItem(usernameNouns)}-${randomSuffix()}`;
};

class NotImplementedError extends Error {
  constructor(featureName) {
    super(`${featureName} 尚未实现`);
    this.name = 'NotImplementedError';
  }
}

module.exports = {
  NotImplementedError,
};

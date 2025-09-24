export default {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.js', '!src/health.js'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'junit', outputName: 'junit.xml' }]
  ],
  transform: {}
};

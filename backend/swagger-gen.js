import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'Movie Intelligence API',
    version: '1.0.0',
    description: 'Backend API for graph+vector+LLM recommendation engine',
    contact: { name: 'Your Name', email: 'your@email.com' }
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' }
    // Add production server later, e.g.:
    // { url: 'https://your-app.onrender.com', description: 'Production' }
  ],
  consumes: ['application/json'],
  produces: ['application/json'],
  securityDefinitions: {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'token'
    }
  },
  security: [{ cookieAuth: [] }]
};

// Output file (will be created in project root)
const outputFile = './swagger.json';

// Routes to scan – point to your route files
const endpointsFiles = [
  './src/routes/authRoutes.js',
  './src/routes/apiRoutes.js'
];

// Generate swagger.json
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger spec generated at', outputFile);
});
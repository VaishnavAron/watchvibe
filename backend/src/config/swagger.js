import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Movie Intelligence API',
      version: '1.0.0',
      description: 'Backend API for graph+vector+LLM recommendation engine'
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local development' }]
  },
  apis: ['./src/routes/*.js']   // reads all route files in src/routes/
};

export default swaggerJsdoc(options);
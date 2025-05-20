/**
 * Configuración personalizada para esbuild en Serverless Framework v4
 */
module.exports = {
  // Configuración general de esbuild
  packager: 'npm',
  platform: 'node',
  target: 'node20',
  concurrency: 10,
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  sourcesContent: false,
  keepOutputDirectory: false,
  
  // Configuración de alias para rutas personalizadas
  alias: {
    '@services': './services',
    '@shared': './shared',
    '@infrastructure': './infrastructure'
  },
  
  // Configuración de exclusiones
  exclude: [
    'aws-sdk',
    '@aws-sdk/*',
    'pg-native',
    'sqlite3',
    'better-sqlite3',
    'mysql',
    'mysql2',
    'oracledb',
    'tedious'
  ],
  
  // Configuración de plugins de esbuild
  plugins: [],
  
  // Configuración de inyección de variables de entorno
  define: {
    'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
  },
  
  // Configuración de banner para añadir código al inicio de los archivos generados
  banner: {
    js: `
      // Serverless Framework v4 with esbuild
      // Generated on: ${new Date().toISOString()}
      // Enable source maps support
      require('source-map-support').install();
    `,
  },
  
  // Configuración para mantener los nombres de las clases
  keepNames: true,
};

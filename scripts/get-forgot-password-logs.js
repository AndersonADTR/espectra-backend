// scripts/get-forgot-password-logs.js

const { CloudWatchLogsClient, DescribeLogStreamsCommand, GetLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

// Configuración
const region = 'us-east-1';
const logGroupName = '/aws/lambda/espectra-backend-dev-forgot-password';

// Crear cliente de CloudWatch Logs
const client = new CloudWatchLogsClient({ region });

// Función para obtener los logs más recientes
async function getRecentLogs() {
  try {
    console.log('Obteniendo streams de logs para el grupo:', logGroupName);
    
    // Obtener los streams de logs más recientes
    const describeCommand = new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 3
    });
    
    const streamsResponse = await client.send(describeCommand);
    
    if (!streamsResponse.logStreams || streamsResponse.logStreams.length === 0) {
      console.log('No se encontraron streams de logs');
      return;
    }
    
    console.log(`Se encontraron ${streamsResponse.logStreams.length} streams de logs`);
    
    // Obtener los eventos de logs para cada stream
    for (const stream of streamsResponse.logStreams) {
      console.log(`\n=== LOGS DEL STREAM: ${stream.logStreamName} ===`);
      console.log(`Fecha de creación: ${new Date(stream.creationTime).toISOString()}`);
      console.log(`Último evento: ${new Date(stream.lastEventTimestamp).toISOString()}`);
      
      const eventsCommand = new GetLogEventsCommand({
        logGroupName,
        logStreamName: stream.logStreamName,
        limit: 100,
        startFromHead: false
      });
      
      try {
        const eventsResponse = await client.send(eventsCommand);
        
        if (!eventsResponse.events || eventsResponse.events.length === 0) {
          console.log('No se encontraron eventos de logs en este stream');
          continue;
        }
        
        console.log(`Se encontraron ${eventsResponse.events.length} eventos de logs`);
        
        // Mostrar los eventos de logs
        for (const event of eventsResponse.events) {
          const timestamp = new Date(event.timestamp).toISOString();
          console.log(`\n[${timestamp}]`);
          console.log(event.message);
        }
      } catch (streamError) {
        console.error(`Error obteniendo eventos para el stream ${stream.logStreamName}:`, streamError);
      }
    }
    
  } catch (error) {
    console.error('Error obteniendo logs:', error);
  }
}

// Ejecutar la función
getRecentLogs();

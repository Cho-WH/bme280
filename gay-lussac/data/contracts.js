export const DATABASE = Object.freeze({ name: 'bme280.gay-lussac', version: 1 });

/** @typedef {{type:'reading', temperatureC:number, pressureHpa:number,
 * extraChannels:{humidityPct:number}, validity:{temperatureC:string,pressureHpa:string,humidityPct:string},
 * attemptId:number, receivedAt:number, monotonicAt:number}} Reading
 * @typedef {{type:'parse-error',reasonCode:string,attemptId:number,receivedAt:number,monotonicAt:number}} ParseError
 * @typedef {{id:string,schemaVersion:number,runRevision:number,name:string,createdAt:number,updatedAt:number,
 * status:'open'|'paused'|'complete'|'interrupted',program:object,profile:object,source:'device'|'replay'|'import',
 * segments:object[],lastSavedSampleId:number,lastSavedEventId:number}} Run
 * @typedef {{runId:string,sampleId:number,segmentId:number|null,receivedAt:number,
 * segmentElapsedMs:number|null,temperatureC:number,pressureHpa:number,validity:object}} Sample
 * @typedef {{runId:string,eventId:number,receivedAt:number,segmentId:number|null,
 * segmentElapsedMs:number|null,type:string,payload:object,source:'user'|'system'}} ExperimentEvent
 */

export const isValidReading = (input) => input?.type === 'reading'
  && input.validity.temperatureC === 'valid' && input.validity.pressureHpa === 'valid';

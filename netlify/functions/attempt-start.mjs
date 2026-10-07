import {getStore} from '@netlify/blobs';
import {handler} from '../../server/handlers.mjs';
export default handler('start',()=>getStore({name:process.env.HW7_STORE_NAME||'hw7-attempts-v3',consistency:'strong'}));

export const config={rateLimit:{windowLimit:120,windowSize:60,aggregateBy:["ip","domain"]}};

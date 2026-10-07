import {getStore} from '@netlify/blobs';
import {handler} from '../../server/handlers.mjs';
export default handler('save',()=>getStore({name:process.env.HW7_STORE_NAME||'hw7-attempts-v3',consistency:'strong'}));

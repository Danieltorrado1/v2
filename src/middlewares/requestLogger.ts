import morgan from 'morgan';

import { env } from '../config/env';
import { loggerStream } from '../config/logger';

const morganFormat = env.NODE_ENV === 'production' ? 'combined' : 'dev';

export const requestLogger = morgan(morganFormat, {
  stream: loggerStream
});

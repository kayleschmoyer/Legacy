import { LOGGER } from '@legacy-sports/logging';
import { createApplication } from './app';

const PORT = 5000;

async function run(): Promise<void> {
  const app = await createApplication();

  app.listen(PORT);
  LOGGER.info(`Server running on port ${PORT}`);
}

run().catch((err) => LOGGER.error(err));

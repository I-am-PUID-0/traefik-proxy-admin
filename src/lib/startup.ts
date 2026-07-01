import "server-only";
import { serviceScheduler } from "./service-scheduler";
import { logger } from "@/lib/logger";

let isInitialized = false;

function isBuildPhase() {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export async function initializeServices() {
  if (isInitialized) {
    return;
  }

  logger.info("Initializing application services...");
  
  try {
    // Start the service auto-disable scheduler
    await serviceScheduler.start();
    
    isInitialized = true;
    logger.info("Application services initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize application services", error);
  }
}

// Cleanup function for graceful shutdown
export function shutdownServices() {
  logger.info("Shutting down application services...");
  
  serviceScheduler.stop();
  
  isInitialized = false;
  logger.info("Application services shut down");
}

// Auto-initialize when this module is imported
if (typeof window === "undefined" && !isBuildPhase()) { // Server-side runtime only
  initializeServices();
}

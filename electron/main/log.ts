import log from "electron-log/main";
import { logFile } from "./paths";

// Route every electron-log output to our own file under %LOCALAPPDATA%\MGSMasterHub\logs\
// instead of electron-log's OS-default location, with a 5 MB rotation cap and info level.
log.transports.file.resolvePathFn = () => logFile();
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.level = "info";
log.transports.console.level = "info";

export default log;

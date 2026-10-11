// Keep only the Foundation's USB programmer and HEX reader in the browser bundle.
export { createUSBConnection } from '@microbit/microbit-connection/usb';
export { createUniversalHexFlashDataSource } from '@microbit/microbit-connection/universal-hex';

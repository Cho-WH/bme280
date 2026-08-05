# BMX280 BLE firmware

The firmware waits for the existing `bme\n` Bluetooth UART command and then
sends one line every 100 ms:

```text
temperature_c,humidity_pct,pressure_hpa
```

BMP280 reports `0` for humidity. BME280 reports measured humidity. The sensor
type and I2C address (`0x76` or `0x77`) are detected by the local BMX280
extension.

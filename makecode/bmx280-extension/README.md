# BMX280 MakeCode extension

Minimal micro:bit extension for BMP280 and BME280 sensors.

- Detects I2C address `0x76` or `0x77` automatically.
- Detects BMP280 (`0x58`) or BME280 (`0x60`) by chip ID.
- Returns temperature in °C and pressure in hPa.
- Returns humidity in % for BME280 and `0` for BMP280.
- Measures once and reuses the result through the value blocks.

## Usage

```typescript
if (BMX280.begin()) {
    BMX280.measure()
    serial.writeValue("temperature", BMX280.temperature())
    serial.writeValue("humidity", BMX280.humidity())
    serial.writeValue("pressure", BMX280.pressure())
}
```

The compensation code is derived from
[`ElectronicCats/pxt-bme280`](https://github.com/ElectronicCats/pxt-bme280),
which originated in the microbit/micropython Chinese community. The original
MIT license is retained in this package.

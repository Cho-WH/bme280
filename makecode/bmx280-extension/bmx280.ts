/**
 * Minimal BMP280/BME280 package for micro:bit MakeCode.
 *
 * Compensation code derived from ElectronicCats/pxt-bme280, originally from
 * the microbit/micropython Chinese community. Distributed under the MIT
 * license included with this package.
 */

/**
 * BMP280/BME280 environmental sensor
 */
//% weight=100 color=#70c0f0 icon="\uf042" block="BMX280"
namespace BMX280 {
    const ADDRESS_0X76 = 0x76
    const ADDRESS_0X77 = 0x77
    const CHIP_ID_REGISTER = 0xD0
    const CHIP_ID_BMP280 = 0x58
    const CHIP_ID_BME280 = 0x60

    let sensorAddress = 0
    let sensorId = 0

    let dig_T1 = 0
    let dig_T2 = 0
    let dig_T3 = 0
    let dig_P1 = 0
    let dig_P2 = 0
    let dig_P3 = 0
    let dig_P4 = 0
    let dig_P5 = 0
    let dig_P6 = 0
    let dig_P7 = 0
    let dig_P8 = 0
    let dig_P9 = 0
    let dig_H1 = 0
    let dig_H2 = 0
    let dig_H3 = 0
    let dig_H4 = 0
    let dig_H5 = 0
    let dig_H6 = 0

    let temperatureValue = 0
    let pressureValue = 0
    let humidityValue = 0

    function readRegisterAt(address: number, register: number): number {
        pins.i2cWriteNumber(address, register, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(address, NumberFormat.UInt8BE)
    }

    function readRegister(register: number): number {
        return readRegisterAt(sensorAddress, register)
    }

    function readInt8(register: number): number {
        pins.i2cWriteNumber(sensorAddress, register, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(sensorAddress, NumberFormat.Int8LE)
    }

    function readUInt16LE(register: number): number {
        pins.i2cWriteNumber(sensorAddress, register, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(sensorAddress, NumberFormat.UInt16LE)
    }

    function readInt16LE(register: number): number {
        pins.i2cWriteNumber(sensorAddress, register, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(sensorAddress, NumberFormat.Int16LE)
    }

    function writeRegister(register: number, value: number): void {
        const buffer = pins.createBuffer(2)
        buffer[0] = register
        buffer[1] = value
        pins.i2cWriteBuffer(sensorAddress, buffer)
    }

    function signExtend12(value: number): number {
        return value & 0x800 ? value - 0x1000 : value
    }

    function findSensorAt(address: number): number {
        const id = readRegisterAt(address, CHIP_ID_REGISTER)
        if (id == CHIP_ID_BMP280 || id == CHIP_ID_BME280) {
            return id
        }
        return 0
    }

    function readCalibration(): void {
        dig_T1 = readUInt16LE(0x88)
        dig_T2 = readInt16LE(0x8A)
        dig_T3 = readInt16LE(0x8C)
        dig_P1 = readUInt16LE(0x8E)
        dig_P2 = readInt16LE(0x90)
        dig_P3 = readInt16LE(0x92)
        dig_P4 = readInt16LE(0x94)
        dig_P5 = readInt16LE(0x96)
        dig_P6 = readInt16LE(0x98)
        dig_P7 = readInt16LE(0x9A)
        dig_P8 = readInt16LE(0x9C)
        dig_P9 = readInt16LE(0x9E)

        if (sensorId == CHIP_ID_BME280) {
            dig_H1 = readRegister(0xA1)
            dig_H2 = readInt16LE(0xE1)
            dig_H3 = readRegister(0xE3)
            const e5 = readRegister(0xE5)
            dig_H4 = signExtend12((readRegister(0xE4) << 4) | (e5 & 0x0F))
            dig_H5 = signExtend12((readRegister(0xE6) << 4) | (e5 >> 4))
            dig_H6 = readInt8(0xE7)
        } else {
            dig_H1 = 0
            dig_H2 = 0
            dig_H3 = 0
            dig_H4 = 0
            dig_H5 = 0
            dig_H6 = 0
        }
    }

    /**
     * Find and initialize a BMP280 or BME280 sensor.
     */
    //% blockId="BMX280_BEGIN" block="initialize BMX280"
    //% weight=100 blockGap=8
    export function begin(): boolean {
        sensorAddress = ADDRESS_0X76
        sensorId = findSensorAt(sensorAddress)

        if (sensorId == 0) {
            sensorAddress = ADDRESS_0X77
            sensorId = findSensorAt(sensorAddress)
        }

        if (sensorId == 0) {
            sensorAddress = 0
            return false
        }

        readCalibration()
        if (dig_T1 == 0 || dig_P1 == 0) {
            sensorAddress = 0
            sensorId = 0
            return false
        }

        if (sensorId == CHIP_ID_BME280) {
            writeRegister(0xF2, 0x04)
        }
        writeRegister(0xF5, 0x0C)
        writeRegister(0xF4, 0x2F)
        basic.pause(40)

        temperatureValue = 0
        pressureValue = 0
        humidityValue = 0
        return true
    }

    /**
     * Measure the sensor once and cache all values.
     */
    //% blockId="BMX280_MEASURE" block="measure BMX280"
    //% weight=90 blockGap=8
    export function measure(): boolean {
        if (sensorId == 0 && !begin()) {
            return false
        }

        const adcTemperature =
            (readRegister(0xFA) << 12) +
            (readRegister(0xFB) << 4) +
            (readRegister(0xFC) >> 4)
        const adcPressure =
            (readRegister(0xF7) << 12) +
            (readRegister(0xF8) << 4) +
            (readRegister(0xF9) >> 4)

        if (adcTemperature == 0x80000 || adcPressure == 0x80000) {
            return false
        }

        let var1 = (((adcTemperature >> 3) - (dig_T1 << 1)) * dig_T2) >> 11
        let var2 =
            (((((adcTemperature >> 4) - dig_T1) * ((adcTemperature >> 4) - dig_T1)) >> 12) * dig_T3) >> 14
        const fineTemperature = var1 + var2
        temperatureValue = ((fineTemperature * 5 + 128) >> 8) / 100

        var1 = (fineTemperature >> 1) - 64000
        var2 = (((var1 >> 2) * (var1 >> 2)) >> 11) * dig_P6
        var2 = var2 + ((var1 * dig_P5) << 1)
        var2 = (var2 >> 2) + (dig_P4 << 16)
        var1 =
            ((((dig_P3 * ((var1 >> 2) * (var1 >> 2))) >> 13) >> 3) +
                ((dig_P2 * var1) >> 1)) >>
            18
        var1 = ((32768 + var1) * dig_P1) >> 15
        if (var1 == 0) {
            return false
        }

        let pressurePa = ((1048576 - adcPressure) - (var2 >> 12)) * 3125
        pressurePa = (pressurePa / var1) * 2
        var1 = (dig_P9 * (((pressurePa >> 3) * (pressurePa >> 3)) >> 13)) >> 12
        var2 = ((pressurePa >> 2) * dig_P8) >> 13
        pressurePa = pressurePa + ((var1 + var2 + dig_P7) >> 4)
        pressureValue = pressurePa / 100

        if (sensorId == CHIP_ID_BME280) {
            const adcHumidity = (readRegister(0xFD) << 8) + readRegister(0xFE)
            if (adcHumidity == 0x8000) {
                return false
            }

            let humidityVar1 = fineTemperature - 76800
            let humidityVar2 =
                (((adcHumidity << 14) - (dig_H4 << 20) - dig_H5 * humidityVar1 + 16384) >> 15)
            humidityVar1 =
                humidityVar2 *
                (((((((humidityVar1 * dig_H6) >> 10) *
                    (((humidityVar1 * dig_H3) >> 11) + 32768)) >>
                    10) +
                    2097152) *
                    dig_H2 +
                    8192) >>
                    14)
            humidityVar2 =
                humidityVar1 -
                (((((humidityVar1 >> 15) * (humidityVar1 >> 15)) >> 7) * dig_H1) >> 4)
            if (humidityVar2 < 0) humidityVar2 = 0
            if (humidityVar2 > 419430400) humidityVar2 = 419430400
            humidityValue = (humidityVar2 >> 12) / 1024
        } else {
            humidityValue = 0
        }

        return true
    }

    /** Current temperature in degrees Celsius. */
    //% blockId="BMX280_TEMPERATURE" block="BMX280 temperature (°C)"
    //% weight=80 blockGap=8
    export function temperature(): number {
        return temperatureValue
    }

    /** Current relative humidity in percent. BMP280 returns 0. */
    //% blockId="BMX280_HUMIDITY" block="BMX280 humidity (%)"
    //% weight=70 blockGap=8
    export function humidity(): number {
        return humidityValue
    }

    /** Current pressure in hPa. */
    //% blockId="BMX280_PRESSURE" block="BMX280 pressure (hPa)"
    //% weight=60 blockGap=8
    export function pressure(): number {
        return pressureValue
    }
}

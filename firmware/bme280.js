bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    inputs = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    if (inputs == "bme") {
        modes = "bme"
        basic.showString("B")
    } else {
        modes = "none"
        basic.clearScreen()
    }
})
function 이름_출력 () {
    basic.showString(control.deviceName().charAt(0))
    basic.showString(control.deviceName().charAt(1))
    basic.showString(control.deviceName().charAt(2))
    basic.showString(control.deviceName().charAt(3))
    basic.showString(control.deviceName().charAt(4))
    basic.showString(" ")
    basic.showString("m")
    basic.showString("g")
    basic.showString(" ")
}
bluetooth.onBluetoothConnected(function () {
    연결됨 = 1
    basic.showIcon(IconNames.Yes)
})
bluetooth.onBluetoothDisconnected(function () {
    control.reset()
})
function Setup () {
    input.setAccelerometerRange(AcceleratorRange.EightG)
    modes = "none"
    연결됨 = 0
    bluetooth.startUartService()
    while (연결됨 == 0) {
        이름_출력()
    }
}
function 전송_자기장 () {
    bluetooth.uartWriteLine("" + convertToText(Math.round(BME280.temperature(BME280_T.T_C) / 256) / 100) + "," + convertToText(Environment.octopus_BME280(Environment.BME280_state.BME280_humidity)) + "," + convertToText(Environment.octopus_BME280(Environment.BME280_state.BME280_pressure)))
}
let 연결됨 = 0
let inputs = ""
let modes = ""
modes = "none"
Setup()
basic.forever(function () {
    if (modes == "bme") {
        전송_자기장()
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})

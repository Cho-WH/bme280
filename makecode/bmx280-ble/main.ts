let connected = false
let streaming = false
let sensorReady = false
let command = ""

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    command = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))

    if (command == "bme") {
        if (!sensorReady) {
            sensorReady = BMX280.begin()
        }
        streaming = sensorReady
        if (sensorReady) {
            basic.showIcon(IconNames.Yes)
        } else {
            basic.showIcon(IconNames.No)
        }
    } else {
        streaming = false
        basic.clearScreen()
    }
})

bluetooth.onBluetoothConnected(function () {
    connected = true
    basic.showIcon(IconNames.Yes)
})

bluetooth.onBluetoothDisconnected(function () {
    connected = false
    streaming = false
    sensorReady = false
    command = ""
    basic.clearScreen()
})

function showDeviceName(): void {
    basic.showString(control.deviceName().charAt(0))
    basic.showString(control.deviceName().charAt(1))
    basic.showString(control.deviceName().charAt(2))
    basic.showString(control.deviceName().charAt(3))
    basic.showString(control.deviceName().charAt(4))
    basic.showString(" ")
}

function sendSample(): void {
    if (!BMX280.measure()) {
        sensorReady = false
        streaming = false
        basic.showIcon(IconNames.No)
        return
    }

    const temperature = Math.round(BMX280.temperature() * 100) / 100
    const humidity = Math.round(BMX280.humidity() * 10) / 10
    const pressure = Math.round(BMX280.pressure() * 100) / 100

    bluetooth.uartWriteLine(
        convertToText(temperature) + "," +
        convertToText(humidity) + "," +
        convertToText(pressure)
    )
}

bluetooth.startUartService()
while (!connected) {
    showDeviceName()
}

basic.forever(function () {
    if (streaming) {
        sendSample()
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})

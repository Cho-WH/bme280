let modes = "none"
let inputs = ""
let 연결됨 = 0
let calibrated = false

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    inputs = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    pins.setPull(DigitalPin.P1, PinPullMode.PullNone)
    pins.setPull(DigitalPin.P2, PinPullMode.PullNone)
    if (inputs == "magnet") {
        modes = "magnet"
        if (!(calibrated)) {
            // Skip calibration when button A or B is held during connection
            if (input.buttonIsPressed(Button.A) || input.buttonIsPressed(Button.B)) {
                calibrated = true
            } else {
                input.calibrateCompass()
                calibrated = true
            }
        }
        basic.showString("M")
    } else {
        modes = "none"
        basic.clearScreen()
    }
})

bluetooth.onBluetoothConnected(function () {
    연결됨 = 1
    basic.showIcon(IconNames.Yes)
})

bluetooth.onBluetoothDisconnected(function () {
    control.reset()
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

function Setup () {
    input.setAccelerometerRange(AcceleratorRange.EightG)
    modes = "none"
    연결됨 = 0
    calibrated = false
    bluetooth.startUartService()
    while (연결됨 == 0) {
        이름_출력()
    }
}

function 전송_자기장 () {
    bluetooth.uartWriteLine(
    convertToText(input.magneticForce(Dimension.X)) + "," +
    convertToText(input.magneticForce(Dimension.Y)) + "," +
    convertToText(input.magneticForce(Dimension.Z)) + "," +
    convertToText(input.magneticForce(Dimension.Strength))
    )
}

Setup()

basic.forever(function () {
    if (modes == "magnet") {
        전송_자기장()
        basic.pause(100)
    } else {
        basic.pause(50)
    }
})

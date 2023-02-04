# CashCode Bill Validator

Package for cashcode bill validator

## Installation

`npm i cashcodejs`

## Usage

### Get device status

```
// Show device errors
device.on('error', (error)=>{
    console.log("Device error:", error);
});

// Show request from user
device.on('request', (req)=>{
    console.log("Request:", req);
});

// Show device response
device.on('response', (res)=>{
    console.log("Response:", res);
});

// Show device current status
device.on('status', (sts)=>{
    console.log("Status:", sts);
});
```

### Get device real-time data

```
// Trigger when device powerup
device.on('powerup', function () {
    console.log('Device power up');
});

// Trigger when device powerdown
device.on('powerup', function () {
    console.log('Device power up');
});

// Trigger when device reset
device.on('reset', function () {
    console.log('Device reset');
});

// Trigger when device initialized
device.on('initialize', ()=>{
    console.log("Device initialize");
});

// Trigger when device on idling
device.on("idling", ()=>{
    console.log("Device on idling state");
});

// Trigger when cassette removed
device.on('cassetteRemoved', ()=>{
    console.log("Cassette removed");
});

// Trigger when cassette full
device.on('cassetteFull', ()=>{
    console.log("Cassette full");
});

// Trigger when device on hold
device.on('hold', ()=>{
    console.log("Device on hold");
});
```

### Handel device cash accept process

```
// Trigger when cash accept
device.on('escrow', async(cash)=>{
    console.log("Amount:", cash.amount);
});

// Trigger when cash return
device.on('returned', (cash)=>{
    console.log('Cash returned:', cash.amount);
});

// Trigger when cash stacked
device.on('stacked', (cash)=>{
    console.log('Cash stacked:', cash.amount);
});

// Trigger when cash rejected
device.on("reject", ()=>{
    console.log("chash Rejected ");
});

// Reject cash
await device.retrieve();

// Stack cash
await device.stack();
```

### Device handle disable event

```
device.on('disabled', async()=>{
    await device.end();
});
```

### Device handle enable event

```
await device.start();
```

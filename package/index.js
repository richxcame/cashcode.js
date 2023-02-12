const EventEmitter = require('events');
const { SerialPort } = require('serialport');
const commands = require('./command');
const CCNetParser = require('./CCNetParser');

/* getPort class */
class getPort {
	constructor(boardKeywordIdentifier, checkingTimeInterval) {
		this.boardPort = '';
		this.boardKeywordIdentifier = boardKeywordIdentifier;
		this.checkingTimeInterval = checkingTimeInterval || 1000;
		this.waitForUsb = setInterval(
			this.getBoardPortName,
			this.checkingTimeInterval
		);
	}

	/* Auto detect device port */
	async getBoardPortName() {
		return new Promise((resolve, reject) => {
			let self = this;
			SerialPort.list().then(function (ports) {
				ports.forEach(function (port) {
					if (port.manufacturer != undefined) {
						if (
							port.manufacturer.includes(
								self.boardKeywordIdentifier
							)
						) {
							self.boardPort = port.path;
							clearInterval(self.waitForUsb);
							resolve(self.boardPort);
						}
					}
				});
			});
		});
	}
}

/* BillValidator class */
class BillValidator extends EventEmitter {
	constructor(option) {
		super();

		this.autoPort = option.autoPort || false;
		this.boardKeywordIdentifier = option.boardKeywordIdentifier || null;
		this.path = option.path || null;
		this.baudRate = option.baudRate;

		this.statusTimerEnable = false;
		this.statusTimer = null;
		this.statusTimerInterval = 1000;

		this.commands = new commands();

		this.status = null;
		this.isSend = false;

		this.opentimer = null;

		/* Define bill table */
		this.billTable = option.billTable?.length
			? option.billTable
			: [
					{
						amount: 1,
						code: 'TMT',
						enabled: false,
						security: false,
					},
					undefined,
					{
						amount: 5,
						code: 'TMT',
						enabled: false,
						security: false,
					},
					{
						amount: 10,
						code: 'TMT',
						enabled: false,
						security: false,
					},
					{
						amount: 20,
						code: 'TMT',
						enabled: false,
						security: false,
					},
					{
						amount: 50,
						code: 'TMT',
						enabled: false,
						security: false,
					},
					{
						amount: 100,
						code: 'TMT',
						enabled: false,
						security: false,
					},
			  ];

		/* Define device info */
		this.info = {
			model: '',
			serial: '',
			asset: '',
		};
	}

	/* Try to connect to the device */
	async connect() {
		try {
			if (this.autoPort) {
				if (this.boardKeywordIdentifier == null)
					console.log(
						new Error('boardKeywordIdentifier not defined').message
					);
				let boardKeywordIdentifier = this.boardKeywordIdentifier;
				this.getPort = new getPort(boardKeywordIdentifier);
				await this.getPort.getBoardPortName().then(async (path) => {
					await this.begin(path);
				});
			} else {
				if (this.path != null) await this.begin(this.path);
				else console.log(new Error('path not defined').message);
			}
		} catch (error) {
			this.emit('error', error.message);
			throw error;
		}
	}

	/* Init serial */
	async begin(path) {
		let self = this;
		this.port = new SerialPort({
			path: path,
			baudRate: this.baudRate,
			dataBits: 8,
			parity: 'none',
			stopBits: 1,
			flowControl: false,
			autoOpen: false,
			openImmediatly: false,
		});

		/* Pipe custom parser */
		this.parser = this.port.pipe(new CCNetParser());

		/* On serial open event. */
		this.port.on('open', function () {
			clearTimeout(self.opentimer);
			console.log('serial port open');
		});

		/* On serial error event. */
		this.port.on('error', function (error) {
			self.emit('error', error.message);
		});

		/* On serial close event. */
		this.port.on('close', function () {
			clearTimeout(self.opentimer);
			console.log('serial port close');
			/* Try to reconnect */
			// open();
		});

		/* Manualy open the serial port */
		open();

		/* Serial reconnect function */
		function open() {
			self.port.open((error) => {
				if (!error) {
					clearTimeout(self.opentimer);
					return;
				} else {
					self.emit('error', error.message);
					self.opentimer = setTimeout(open, 5000);
				}
			});
		}
	}

	/* Return port open status */
	get isOpen() {
		return this.port.isOpen;
	}

	/* Device funtion begin */

	/* Reset device */
	async reset() {
		try {
			await this.execute(0x30, [0x41]);
		} catch (error) {
			this.emit('error', error.message);
		}
		this.emit('reset');
	}

	/* End device */
	async end() {
		try {
			await this.execute(0x34, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
		} catch (error) {
			this.emit('error', error.message);
		}
	}

	/* Start device */
	async start() {
		let self = this;
		try {
			if (this.isOpen) {
				await self.onSerialPortOpen();
			}
			await this.execute(0x34, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
		} catch (error) {
			this.emit('error', error.message);
		}
	}

	/* Stack device */
	async stack() {
		try {
			await this.execute(0x35);
		} catch (error) {
			this.emit('error', error.message);
		}
	}

	/* Retrieve device */
	async retrieve() {
		try {
			await this.execute(0x36);
		} catch (error) {
			this.emit('error', error.message);
		}
	}

	/* Hold device */
	async hold() {
		try {
			await this.execute(0x38);
		} catch (error) {
			this.emit('error', error.message);
		}
	}

	/* Device funtions end */

	waitStatus(status, timeout = 1000) {
		/* Linked self */
		let self = this;

		return new Promise(function (resolve, reject) {
			if (self.status == status) {
				resolve(true);
			}

			let timer = null;
			let timerHandler = function () {
				clearTimeout(timer);

				/* Unbind event. */
				self.removeListener('status', handler);
				reject(new Error('Request timeout').message);
			};

			let handler = function (primary) {
				if (primary == status) {
					clearTimeout(timer);

					/* Unbind event. */
					self.removeListener('status', handler);
					resolve(true);
				}
			};

			self.on('status', handler);
			if (timeout) {
				timer = setTimeout(timerHandler, timeout);
			}
		});
	}

	execute(command, params = [], timeout = 5000) {
		let self = this;
		return new Promise(async function (resolve, reject) {
			try {
				/* Preparing command to send. */
				let request = self.commands.request(command, params);
				self.emit('request', request);

				/* Send command to device. */
				// let response = await self.send(request, timeout)
				await self
					.send(request, timeout)
					.then((response) => {
						self.emit('response', response);

						/* Processing command response. */
						resolve(self.commands.response(response));
					})
					.catch((error) => {
						self.emit('error', error.message);
						self.disconnect().then(() => {
							self.connect();
						});
					});
			} catch (error) {
				self.emit('error', error.message);
				reject(error);
			}
		});
	}

	send(request, timeout = 1000) {
		let self = this;

		return new Promise(function (resolve, reject) {
			let timer = null;

			/* Timeout timer handler. */
			let timerHandler = function () {
				reject(new Error('Device not powerup'));
			};

			let handler = async function (response) {
				clearTimeout(timer);
				self.parser.removeListener('data', handler);

				/* Check CRC */
				let ln = response.length;
				let check = response.slice(ln - 2, ln);
				let slice = response.slice(0, ln - 2);

				/* Check response CRC */
				if (
					check.toString('hex') !==
					self.commands.getCRC16(slice).toString('hex')
				) {
					self.isSend = false;
					reject(new Error('Wrong response data hash').message);
				}

				let data = response.slice(3, ln - 2);

				/* Check response type */
				if (data.length == 1 && data[0] == 0x00) {
					/* Response receive as ACK */
				} else if (data.length == 1 && data[0] == 0xff) {
					/* Response receive as NAK */
					reject(new Error('Wrong request data hash').message);
				} else {
					/* Send ACK */
					// self.execute(0x00);
				}

				self.isSend = true;
				resolve(data);
			};
			self.parser.once('data', handler);
			self.port.write(request);
			timer = setTimeout(timerHandler, timeout);
		});
	}

	/* Get device info */
	Getinfo(data) {
		return {
			model: data.slice(0, 15).toString().trim(),
			serial: data.slice(15, 27).toString().trim(),
			asset: data.slice(27, 34).toString('hex'),
		};
	}

	/* Get device bill table */
	Getbilltype(data) {
		var response = [],
			word;

		for (var i = 0; i < 24; i++) {
			word = data.slice(i * 5, i * 5 + 5);

			response.push({
				amount: word[0] * Math.pow(10, word[4]),
				code: word.slice(1, 4).toString(),
				enabled: false,
				security: false,
			});
		}

		return response;
	}

	async init() {
		/* Begin device init */
		try {
			/* Wait "Initial" status */
			await this.waitStatus('13', 1000);

			/* Stop poll-ack */
			this.statusTimerStop();

			// /* Get bill type description */
			// this.billTable = this.Getbilltype(await this.execute(0x41));
			// console.log("billTable: ", this.billTable);

			/* Set device security */
			await this.execute(0x32, [0x00, 0x00, 0x00]);

			// /* Get identification */
			// this.info =  this.Getinfo(await this.execute(0x37));
			// console.log("Info:", this.info);

			/* Enable bill types */
			await this.execute(0x34, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]).then(
				() => {
					/* Start poll-ack */
					setTimeout(() => {
						this.statusTimerStart();
					}, 3000);
				}
			);

			return true;
		} catch (error) {
			console.log('init error:', error.message);
		}
	}

	async onSerialPortOpen() {
		/* Start poll-ack */
		this.statusTimerStart();
	}

	/* Status stop func */
	statusTimerStop() {
		this.statusTimerEnable = false;
		clearTimeout(this.statusTimer);
	}

	/* Check status */
	async onStatus(status) {
		if (status.length >= 2) {
			this.status = status[0].toString(16);
			this.secondStatus == status[1].toString(16);
			this.emit('status', this.status, this.secondStatus);

			switch (status[0]) {
				/* Escrow position */
				case 0x80:
					this.emit(
						'escrow',
						this.billTable[parseInt(status[1].toString(10))]
					);
					break;

				/* Bill stacked */
				case 0x81:
					this.emit(
						'stacked',
						this.billTable[parseInt(status[1].toString(10))]
					);
					this.execute(0x00);
					break;

				/* Returned */
				case 0x82:
					this.emit(
						'returned',
						this.billTable[parseInt(status[1].toString(10))]
					);
					this.execute(0x00);
					break;

				/* Reject */
				case 0x1c:
					this.emit('reject');
					break;
			}
		} else {
			this.status = status[0].toString(16);
			this.emit('status', this.status, '');

			switch (status[0]) {
				/* Power Up */
				case 0x10:
					this.emit('powerup');
					await this.reset();
					break;

				/* Initialize */
				case 0x13:
					this.emit('initialize');
					await this.init();
					break;

				/* Idling */
				case 0x14:
					this.emit('idling');
					break;

				/* Accepting */
				case 0x15:
					this.emit('accepting');
					break;

				/* Disabled */
				case 0x19:
					this.emit('disabled');
					break;

				/* Cassette removed */
				case 0x41:
					this.emit('cassetteFull');
					break;

				/* Cassette removed */
				case 0x42:
					this.emit('cassetteRemoved');
					break;

				/* Holding */
				case 0x1a:
					this.emit('hold');
					break;
			}
		}
	}

	/* Start status timer */
	statusTimerStart() {
		let self = this;
		this.statusTimerEnable = true;

		this.statusTimer = setTimeout(function () {
			self.onStatusTimer();
		}, this.statusTimerInterval);
	}

	/* Event of processing the status timer */
	onStatusTimer() {
		let self = this;
		clearInterval(this.statusTimer);

		if (!this.isOpen) {
			return;
		}

		/* Poll device */
		this.execute(0x33, [0x41])
			.then(function (data) {
				/* Check permission to run. */
				if (self.statusTimerEnable) {
					/* Start status timer. */
					self.statusTimer = setTimeout(function () {
						self.onStatusTimer();
					}, self.statusTimerInterval);
				}

				/* Send event. */
				self.onStatus(data);
			})
			.catch(function (error) {
				/* Check permission to run. */
				if (self.statusTimerEnable) {
					/* Start status timer. */
					self.statusTimer = setTimeout(function () {
						self.onStatusTimer();
					}, self.statusTimerInterval);
				}

				console.log('onStatusTimer error:', error.message);
			});
	}

	/* Disconnect from device */
	async disconnect() {
		this.close();
	}

	/* Close comport */
	close() {
		let self = this;

		return new Promise(function (resolve, reject) {
			if (self.port.isOpen) {
				self.port.close(function (error) {
					if (error) {
						reject(error);
					}

					resolve(true);
				});
			} else {
				resolve(true);
			}
		});
	}
}

module.exports = BillValidator;

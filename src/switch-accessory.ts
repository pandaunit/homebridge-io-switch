import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
} from "homebridge";
var MCP23017 = require('node-mcp23017');

export type Device = {
  name: string;
  activeLow: boolean;
  input: number;
  output: number;
}

export class IOSwitch implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly mcp: typeof MCP23017;
  private readonly onState: number;
  private readonly offState: number;
  private readonly outputPin: number;

  private switchOn = false;
  private lastInputValue = true; // physical button switched off

  name: string;

  private readonly switchService: Service;
  private readonly informationService: Service;

  constructor(hap: HAP, log: Logging, mcp: typeof MCP23017, device: Device) {
    this.log = log;
    this.mcp = mcp;
    this.name = device.name;
    this.outputPin = device.output;
    this.onState = device.activeLow ? 0 : 1;
    this.offState = device.activeLow ? 1 : 0;
    this.lastInputValue = true;

    this.mcp.pinMode(device.input, this.mcp.INPUT_PULLUP);
    this.mcp.pinMode(device.output, this.mcp.OUTPUT);
    this.mcp.digitalWrite(device.output, this.offState);

    this.switchService = new hap.Service.Switch(this.name);
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        log.info("%s current state was returned: %s", this.name, (this.switchOn ? "ON" : "OFF"));
        callback(undefined, this.switchOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.switchLight(value);
        callback();
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Smart Panda")
      .setCharacteristic(hap.Characteristic.Model, "IO Switch")
      .setCharacteristic(hap.Characteristic.SerialNumber, "001");

    log.info("Switch '%s' created! Listening for input signals.", this.name);

    const setIntervalConst: ReturnType<typeof setInterval> = setInterval(() => {
      var readInput = () => {
        return (pin: number, err: string, value: boolean) => {
          if (this.lastInputValue == value) {
            return;
          }
          log.info("%s physical button pressed!", this.name);
          if (value == false && this.switchOn == false) {
            this.switchLight(true);
            this.switchService.updateCharacteristic(hap.Characteristic.On, true);
          } else if (value == false && this.switchOn == true) {
            this.switchLight(false);
            this.switchService.updateCharacteristic(hap.Characteristic.On, false);
          } else if (err) {
            log.error(err);
          }
          this.lastInputValue = value;
        }
      }
      this.mcp.digitalRead(device.input, readInput());
    }, 50);
  }

  switchLight(value: CharacteristicValue): void {
    this.switchOn = value as boolean;
    this.mcp.digitalWrite(this.outputPin, (this.switchOn ? this.onState : this.offState));
    this.log.info("%s state was set to: %s", this.name, (this.switchOn ? "ON" : "OFF"));
  }

  identify(): void {
    this.log("%s identify!", this.name);
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.switchService,
    ];
  }

}
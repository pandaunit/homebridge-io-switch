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
import { StatelessSwitchConfig } from "./io-accessory-config";
var MCP23017 = require('node-mcp23017');

const STATE_ON = true;
const STATE_OFF = false;

export class StatelessSwitchAccessory implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly mcp: ReturnType<typeof MCP23017>;
  private readonly onState: number;
  private readonly offState: number;
  private readonly outputPin: number;
  private readonly duration: number;
  private readonly inputInterval: number;
  private switchTimeout: ReturnType<typeof setTimeout>;

  private currentState = STATE_OFF;
  private lastInputValue = true; // physical button is not pressed

  name: string;

  private readonly statelessSwitchService: Service;
  private readonly informationService: Service;
  private api: HAP;

  constructor(hap: HAP, log: Logging, mcp: ReturnType<typeof MCP23017>, config: StatelessSwitchConfig) {
    this.api = hap;
    this.log = log;
    this.mcp = mcp;
    this.name = config.name;
    this.outputPin = config.output;
    this.onState = config.activeLow ? 0 : 1;
    this.offState = config.activeLow ? 1 : 0;
    this.duration = config.duration;
    this.inputInterval = config.inputInterval || 50;

    this.mcp.pinMode(config.input, this.mcp.INPUT_PULLUP);
    this.mcp.pinMode(config.output, this.mcp.OUTPUT);
    this.mcp.digitalWrite(config.output, this.offState);

    this.statelessSwitchService = new hap.Service.Switch(this.name);
    this.statelessSwitchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        log.info("%s current state was returned: %s", this.name, this.currentState);
        callback(undefined, this.currentState);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.setSwitch(value);
        callback();
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Smart Panda")
      .setCharacteristic(hap.Characteristic.Model, "IO Lock")
      .setCharacteristic(hap.Characteristic.SerialNumber, "001");

    log.info("Accessory '%s' created! Listening for input signals.", this.name);

    setInterval(() => {
      var readInput = () => {
        return (pin: number, err: string, value: boolean) => {
          if (err) {
            throw new Error("Error while reading input signals");
          }
          if (this.lastInputValue == value) {
            return;
          }
          log.info("%s physical button pressed!", this.name);
          if (value == false) {
            this.statelessSwitchService.updateCharacteristic(hap.Characteristic.On, STATE_ON);
            this.setSwitch(STATE_ON);
          }
          this.lastInputValue = value;
        }
      }
      try {
        this.mcp.digitalRead(config.input, readInput());
      } catch (error: any) {
        log.error(error);
      }
    }, this.inputInterval);
  }

  setSwitch(value: CharacteristicValue): void {
    let state = value as boolean;
    this.log.info("%s state was set to: %s", this.name, (state ? "on" : "off"));

    if (state) {
      this.mcp.digitalWrite(this.outputPin, this.onState);
      this.statelessSwitchService.updateCharacteristic(this.api.Characteristic.On, STATE_ON);
      this.currentState = STATE_ON;
      this.switchTimeout = setTimeout(() => {
        this.mcp.digitalWrite(this.outputPin, this.offState);
        this.currentState = STATE_OFF;
        this.statelessSwitchService.updateCharacteristic(this.api.Characteristic.On, STATE_OFF);
      }, this.duration);
    } else {
      clearTimeout(this.switchTimeout);
      this.mcp.digitalWrite(this.outputPin, this.offState);
      this.currentState = STATE_OFF;
      this.statelessSwitchService.updateCharacteristic(this.api.Characteristic.On, STATE_OFF);
    }
  }

  identify(): void {
    this.log("%s identify!", this.name);
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.statelessSwitchService,
    ];
  }

}
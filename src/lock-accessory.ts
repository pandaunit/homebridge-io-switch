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
import { LockConfig } from "./io-accessory-config";
var MCP23017 = require('node-mcp23017');

const STATE_UNSECURED = 0;
const STATE_SECURED = 1;

export class LockAccessory implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly mcp: ReturnType<typeof MCP23017>;
  private readonly onState: number;
  private readonly offState: number;
  private readonly outputPin: number;
  private readonly unlockingDuration: number;
  private readonly inputInterval: number;
  private unlockTimeout: ReturnType<typeof setTimeout>;

  private currentState = STATE_SECURED;
  private targetState = STATE_SECURED;
  private lastInputValue = true; // physical button is not pressed

  name: string;

  private readonly lockService: Service;
  private readonly informationService: Service;
  private api: HAP;

  constructor(hap: HAP, log: Logging, mcp: ReturnType<typeof MCP23017>, config: LockConfig) {
    this.api = hap;
    this.log = log;
    this.mcp = mcp;
    this.name = config.name;
    this.outputPin = config.output;
    this.onState = config.activeLow ? 0 : 1;
    this.offState = config.activeLow ? 1 : 0;
    this.unlockingDuration = config.unlockingDuration;
    this.inputInterval = config.inputInterval || 50;

    this.mcp.pinMode(config.input, this.mcp.INPUT_PULLUP);
    this.mcp.pinMode(config.output, this.mcp.OUTPUT);
    this.mcp.digitalWrite(config.output, this.offState);

    this.lockService = new hap.Service.LockMechanism(this.name);
    this.lockService.getCharacteristic(hap.Characteristic.LockCurrentState)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        log.info("%s current state was returned: %s", this.name, this.currentState);
        callback(undefined, this.currentState);
      });
    this.lockService.getCharacteristic(hap.Characteristic.LockTargetState)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        log.info("%s target state was returned: %s", this.name, this.targetState);
        callback(undefined, this.targetState);
      })
      .on(CharacteristicEventTypes.SET, (state: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.setTargetState(state);
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
            this.lockService.updateCharacteristic(hap.Characteristic.LockTargetState, STATE_UNSECURED);
            this.setTargetState(STATE_UNSECURED);
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

  setTargetState(value: CharacteristicValue): void {
    let state = value as boolean;
    this.log.info("%s state was set to: %s", this.name, (state ? "secured" : "unsecured"));

    if (state) {
      clearTimeout(this.unlockTimeout);
      this.mcp.digitalWrite(this.outputPin, this.offState);
      this.currentState = STATE_SECURED;
      this.lockService.updateCharacteristic(this.api.Characteristic.LockCurrentState, state);
    } else {
      this.mcp.digitalWrite(this.outputPin, this.onState);
      this.lockService.updateCharacteristic(this.api.Characteristic.LockCurrentState, state);
      this.currentState = STATE_UNSECURED;
      this.unlockTimeout = setTimeout(() => {
        this.mcp.digitalWrite(this.outputPin, this.offState);
        this.currentState = STATE_SECURED;
        this.lockService.updateCharacteristic(this.api.Characteristic.LockTargetState, STATE_SECURED);
        this.lockService.updateCharacteristic(this.api.Characteristic.LockCurrentState, STATE_SECURED);
      }, this.unlockingDuration);
    }
  }

  identify(): void {
    this.log("%s identify!", this.name);
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.lockService,
    ];
  }

}
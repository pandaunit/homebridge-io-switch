import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes
} from "homebridge";
import { WindowCoveringConfig } from "./io-accessory-config";
var MCP23017 = require('node-mcp23017');

const STATE_DECREASING = 0;
const STATE_INCREASING = 1;
const STATE_STOPPED = 2;

export class WindowCoveringAccessory implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly mcp: ReturnType<typeof MCP23017>;
  private readonly onState: number;
  private readonly offState: number;
  private readonly outputPinUp: number;
  private readonly outputPinDown: number;
  private readonly durationUp: number;
  private readonly durationDown: number;
  private readonly durationOffset: number;
  private readonly intervalUp: number;
  private readonly intervalDown: number;
  private currentPositionInterval: ReturnType<typeof setInterval>;
  private finalBlindsStateTimeout: ReturnType<typeof setTimeout>;
  private togglePinTimeout: ReturnType<typeof setTimeout>;

  private inputUpLastValue = true; // physical button is not pressed
  private inputDownLastValue = true; // physical button is not pressed
  private currentPosition = 0; // down by default
  private targetPosition = 0;
  private positionState = STATE_STOPPED;

  name: string;

  private readonly windowCoveringService: Service;
  private readonly informationService: Service;
  private api: HAP;

  constructor(hap: HAP, log: Logging, mcp: ReturnType<typeof MCP23017>, config: WindowCoveringConfig) {
    this.api = hap;
    this.log = log;
    this.mcp = mcp;
    this.name = config.name;
    this.outputPinUp = config.outputUp;
    this.outputPinDown = config.outputDown;
    this.durationUp = config.durationUp;
    this.durationDown = config.durationDown;
    this.durationOffset = config.durationOffset;
    this.onState = config.activeLow ? 0 : 1;
    this.offState = config.activeLow ? 1 : 0;
    this.intervalUp = this.durationUp / 100;
    this.intervalDown = this.durationDown / 100;

    this.mcp.pinMode(config.inputUp, this.mcp.INPUT_PULLUP);
    this.mcp.pinMode(config.inputDown, this.mcp.INPUT_PULLUP);
    this.mcp.pinMode(config.outputUp, this.mcp.OUTPUT);
    this.mcp.pinMode(config.outputDown, this.mcp.OUTPUT);
    this.mcp.digitalWrite(config.outputUp, this.offState);
    this.mcp.digitalWrite(config.outputDown, this.offState);

    this.windowCoveringService = new hap.Service.WindowCovering(this.name);
    this.windowCoveringService.getCharacteristic(hap.Characteristic.PositionState)
      .on(CharacteristicEventTypes.GET, this.getPositionState.bind(this));
    this.windowCoveringService.getCharacteristic(hap.Characteristic.CurrentPosition)
      .on(CharacteristicEventTypes.GET, this.getCurrentPosition.bind(this));
    this.windowCoveringService.getCharacteristic(hap.Characteristic.TargetPosition)
      .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this))
      .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this));

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Smart Panda")
      .setCharacteristic(hap.Characteristic.Model, "IO Window Covering")
      .setCharacteristic(hap.Characteristic.SerialNumber, "001");

    log.info("Accessory '%s' created! Listening for input signals.", this.name);

    const setIntervalConst: ReturnType<typeof setInterval> = setInterval(() => {
      var readInput = (lastInputValue: boolean) => {
        return (pin: number, err: string, value: boolean) => {
          if (lastInputValue == value) {
            return;
          }
          if (pin == config.inputUp && !this.inputDownLastValue) {
            return;
          }
          if (pin == config.inputDown && !this.inputUpLastValue) {
            return;
          }
          if (pin == config.inputUp) {
            this.inputUpLastValue = value;
          } else if (pin == config.inputDown) {
            this.inputDownLastValue = value;
          }
          if (value == false && pin == config.inputUp) {
            log.info("%s button up pressed!", this.name);
            this.windowCoveringService.updateCharacteristic(hap.Characteristic.TargetPosition, 100);
            this.setTargetPositionNoCallback(100, true, false);
          } else if (value == false && pin == config.inputDown) {
            log.info("%s button down was pressed!", this.name);
            this.windowCoveringService.updateCharacteristic(hap.Characteristic.TargetPosition, 0);
            this.setTargetPositionNoCallback(0, false, true);
          } else if (err) {
            log.error(err);
          }
        }
      }
      this.mcp.digitalRead(config.inputUp, readInput(this.inputUpLastValue));
      this.mcp.digitalRead(config.inputDown, readInput(this.inputDownLastValue));
    }, 50);
  }

  getPositionState(callback: CharacteristicGetCallback): void {
    this.log.info("%s position state was returned: %s", this.name, this.positionState);
    callback(undefined, this.positionState);
  }

  getCurrentPosition(callback: CharacteristicGetCallback): void {
    this.log.info("%s current position was returned: %s", this.name, this.currentPosition);
    callback(undefined, this.currentPosition);
  }

  getTargetPosition(callback: CharacteristicGetCallback): void {
    this.log.info("%s target position was returned: %s", this.name, this.targetPosition);
    callback(undefined, this.targetPosition);
  }

  setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    if (this.currentPosition == value) {
      this.log.info("%s current position already matches target position. There is nothing to do.", this.name);
      callback();
      return;
    }
    this.setTargetPositionNoCallback(value, false, false);
    callback();
  }

  setTargetPositionNoCallback(value: CharacteristicValue, buttonUpPresssed: boolean, buttonDownPressed: boolean): void {
    this.log.info("%s target position was set to: %s", this.name, value);
    if ((buttonUpPresssed && !this.inputDownLastValue) || (buttonDownPressed && !this.inputUpLastValue)) {
      this.log.warn("%s button up and down pressed. Stopping blinds to save the motors.", this.name);
      this.mcp.digitalWrite(this.outputPinUp, this.offState);
      this.mcp.digitalWrite(this.outputPinDown, this.offState);
      this.setBlindsStateAfterErrorOrManualStop();
      return;
    }
    this.targetPosition = value as number;
    let moveUp = (this.targetPosition >= this.currentPosition);
    let duration: number;
    let oppositeDirection: boolean = false;

    if (this.positionState != STATE_STOPPED) {
      this.log.info("%s is moving, current position %s", this.name, this.currentPosition);
      if (this.oppositeDirection(moveUp)) {
        oppositeDirection = true;
        this.log.info("Stopping the %s because of opposite direction", this.name);
        this.mcp.digitalWrite((moveUp ? this.outputPinDown : this.outputPinUp), this.offState);
      } else if (moveUp && buttonUpPresssed) {
        this.log.info("Stopping the %s because button up was pressed while blinds were already moving up.", this.name);
        this.mcp.digitalWrite(this.outputPinUp, this.offState);
        this.windowCoveringService.updateCharacteristic(this.api.Characteristic.CurrentPosition, this.currentPosition);
        this.windowCoveringService.updateCharacteristic(this.api.Characteristic.TargetPosition, this.currentPosition);
        this.setBlindsStateAfterErrorOrManualStop();
        return;
      } else if (!moveUp && buttonDownPressed) {
        this.log.info("Stopping the %s because button down was pressed while blinds were already moving down.", this.name);
        this.mcp.digitalWrite(this.outputPinDown, this.offState);
        this.windowCoveringService.updateCharacteristic(this.api.Characteristic.CurrentPosition, this.currentPosition);
        this.windowCoveringService.updateCharacteristic(this.api.Characteristic.TargetPosition, this.currentPosition);
        this.setBlindsStateAfterErrorOrManualStop();
        return;
      }
      clearInterval(this.currentPositionInterval);
      clearTimeout(this.finalBlindsStateTimeout);
      clearTimeout(this.togglePinTimeout);
    }

    if (this.currentPosition == value) {
      this.log.info("%s current position already matches target position. There is nothing to do.", this.name);
      return;
    }

    if (moveUp) {
      duration = Math.round((this.targetPosition - this.currentPosition) / 100 * this.durationUp);
      this.currentPositionInterval = setInterval(this.setCurrentPosition.bind(this, moveUp), this.intervalUp);
    } else {
      duration = Math.round((this.currentPosition - this.targetPosition) / 100 * this.durationDown);
      this.currentPositionInterval = setInterval(this.setCurrentPosition.bind(this, moveUp), this.intervalDown);
    }

    setTimeout(() => {
      clearInterval(this.currentPositionInterval);
    }, duration);

    if (oppositeDirection) {
      setTimeout(() => {
        this.log.info("%s has waited 500ms before moving in opposite direction.", this.name);
        this.togglePin(moveUp, duration);
      }, 500);
    } else {
      this.togglePin(moveUp, duration);
    }
  }

  togglePin(moveUp: boolean, duration: number) {
    let pin = (moveUp ? this.outputPinUp : this.outputPinDown);
    if (this.durationOffset && (this.targetPosition == 0 || this.targetPosition == 100)) duration += this.durationOffset;
    this.log.info("%s was set to move %s to position %s. Duration %s ms.", this.name, (moveUp ? 'up' : 'down'), this.targetPosition, duration);
    this.finalBlindsStateTimeout = setTimeout(this.setFinalBlindsState.bind(this), duration);
    this.mcp.digitalWrite(pin, this.onState);
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.PositionState, (moveUp ? STATE_INCREASING : STATE_DECREASING));
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.TargetPosition, this.targetPosition);
    this.positionState = (moveUp ? STATE_INCREASING : STATE_DECREASING);
    this.togglePinTimeout = setTimeout(() => {
      this.mcp.digitalWrite(pin, this.offState);
    }, duration);
  }

  setFinalBlindsState() {
    clearInterval(this.currentPositionInterval);
    this.positionState = STATE_STOPPED;
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.PositionState, STATE_STOPPED);
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.CurrentPosition, this.targetPosition);
    this.currentPosition = this.targetPosition;
    this.log.info("%s successfully moved to target position: %s", this.name, this.targetPosition);
  }

  setBlindsStateAfterErrorOrManualStop() {
    clearInterval(this.currentPositionInterval);
    clearTimeout(this.finalBlindsStateTimeout);
    clearTimeout(this.togglePinTimeout);
    this.targetPosition = this.currentPosition;
    this.positionState = STATE_STOPPED;
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.CurrentPosition, this.currentPosition);
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.TargetPosition, this.currentPosition);
    this.windowCoveringService.updateCharacteristic(this.api.Characteristic.PositionState, STATE_STOPPED);
  }

  setCurrentPosition(moveUp: boolean) {
    if (moveUp) {
      this.currentPosition++;
    } else {
      this.currentPosition--;
    }
  }

  oppositeDirection(moveUp: boolean): boolean {
    return (this.positionState == STATE_INCREASING && !moveUp) || (this.positionState == STATE_DECREASING && moveUp);
  }

  identify(): void {
    this.log.info("%s identify!", this.name);
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.windowCoveringService,
    ];
  }

}
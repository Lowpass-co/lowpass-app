import { registerEntity } from './registry';
import { flightDescriptor } from './flight';
import { gearDescriptor } from './gear';
import { personDescriptor } from './person';
import { roomDescriptor } from './room';
import { showDescriptor } from './show';

let registered = false;

/** Idempotent. Call from EntityRoutingProvider on the client. */
export function registerAllEntities(): void {
  if (registered) return;
  registered = true;
  registerEntity(personDescriptor);
  registerEntity(flightDescriptor);
  registerEntity(roomDescriptor);
  registerEntity(gearDescriptor);
  registerEntity(showDescriptor);
}

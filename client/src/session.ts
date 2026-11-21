import { DEFAULT_AVATAR } from './avatar/avatar';
import type { Avatar } from './avatar/avatar';

// Info about the current player, filled in after login.
export const session: { name: string; avatar: Avatar } = {
  name: 'Guest',
  avatar: { ...DEFAULT_AVATAR },
};

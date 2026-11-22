import { supabase } from '../supabase';
import { SPECIES } from './species';
import type { PetInfo } from './species';

export interface OwnedPet extends PetInfo {
  id: string;
  active: boolean;
}

// Your pets, as last loaded from the database (the database is the boss)
export const pets: { list: OwnedPet[]; loaded: boolean } = { list: [], loaded: false };

const listeners = new Set<() => void>();
// Returns a function that stops listening
export function onPetsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function activePet(): OwnedPet | null {
  return pets.list.find((p) => p.active) ?? null;
}

export async function loadPets(): Promise<void> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) throw new Error('Not logged in');
  const { data, error } = await supabase
    .from('pets')
    .select('id, species, name, active')
    .eq('owner_id', uid)
    .order('created_at');
  if (error) throw new Error(error.message);
  pets.list = ((data ?? []) as OwnedPet[]).filter((p) => p.species >= 0 && p.species < SPECIES.length);
  pets.loaded = true;
  listeners.forEach((fn) => fn());
}

export async function adoptStarter(species: number, name: string): Promise<void> {
  const { error } = await supabase.rpc('adopt_starter', { p_species: species, p_name: name });
  if (error) throw new Error(error.message);
  await loadPets();
}

export async function setActivePet(petId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_active_pet', { p_pet: petId });
  if (error) throw new Error(error.message);
  await loadPets();
}

export async function renamePet(petId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_pet', { p_pet: petId, p_name: name });
  if (error) throw new Error(error.message);
  await loadPets();
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NAME_MAX, sanitizeName } from '@gridlock/engine';
import { useSyncExternalStore } from 'react';

const NAME_KEY = 'gridlock.name';

const ADJECTIVES = ['Swift', 'Clever', 'Sly', 'Bold', 'Quiet', 'Lucky', 'Brave', 'Witty'];
const ANIMALS = ['Fox', 'Owl', 'Lynx', 'Otter', 'Hawk', 'Panda', 'Wolf', 'Koala'];

function randomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a}${b}${Math.floor(Math.random() * 90 + 10)}`.slice(0, NAME_MAX);
}

let name = randomName();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Loads the saved nickname once at startup; keeps the random one if storage is unavailable. */
export async function loadProfile() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = await AsyncStorage.getItem(NAME_KEY);
    if (saved) name = sanitizeName(saved);
    else await AsyncStorage.setItem(NAME_KEY, name);
  } catch {
    // private browsing / storage disabled: the random name still works for this session
  }
  emit();
}

export async function setName(next: string) {
  name = sanitizeName(next);
  emit();
  try {
    await AsyncStorage.setItem(NAME_KEY, name);
  } catch {}
}

export function getName() {
  return name;
}

export function useName() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => name,
    () => name,
  );
}

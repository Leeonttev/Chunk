import { ref } from 'vue'

/** Shell-wide UI flags that several unrelated components open or read. */
export const createInstanceOpen = ref(false)
export const addAccountOpen = ref(false)

/** Shared state must not be hot-swapped: a fresh copy would lose its core event subscriptions, so reload instead. */
import.meta.hot?.accept(() => window.location.reload())

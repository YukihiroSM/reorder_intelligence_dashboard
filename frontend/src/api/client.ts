import axios from 'axios'

// Relative base — dev goes through the Vite proxy, prod through nginx. Both
// route /api/... to the FastAPI backend.
export const client = axios.create({ baseURL: '' })

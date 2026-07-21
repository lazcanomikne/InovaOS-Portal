// Store multi-empresa: qué empresa SAP está activa (SBOINOVA / SBOMIKNE / SBOLOG).
// Persiste en localStorage; el interceptor de axios lee `currentCompany`
// y lo envía en el header X-Company de cada request.
import { defineStore } from 'pinia'

// Cada empresa tiene dos variantes de logo:
//   logo / logoDark : versión clara (blanca), para fondos de color u oscuros
//   printLogo       : versión oscura, para papel e impresión sobre fondo blanco
// Los archivos viven en public/logos, así que se referencian por ruta absoluta.
export const COMPANIES = [
  {
    id: 'SBOINOVA',
    label: 'Inovatech',
    shortLabel: 'Inovatech',
    logo: '/logos/inovatech-light.svg',
    logoDark: '/logos/inovatech-light.svg',
    printLogo: '/logos/logo-blue.png',
    // `color` tiñe el sidebar y las barras para señalar la empresa activa.
    color: '#0096D5'
  },
  {
    id: 'SBOMIKNE',
    label: 'Mikne',
    shortLabel: 'Mikne',
    logo: '/logos/mikne-dark.png',
    logoDark: '/logos/mikne-dark.png',
    printLogo: '/logos/mikne-light.png',
    color: '#062952'
  },
  {
    id: 'SBOLOG',
    label: 'Log Company',
    shortLabel: 'Log',
    logo: '/logos/log-dark.svg',
    logoDark: '/logos/log-dark.svg',
    printLogo: '/logos/log-light.svg',
    color: '#EA580C'
  }
]

const STORAGE_KEY = 'currentCompany'
const DEFAULT_COMPANY = 'SBOINOVA'

const validateId = id => (COMPANIES.some(c => c.id === id) ? id : DEFAULT_COMPANY)

export const useCompanyStore = defineStore('company', {
  state: () => ({
    currentCompany: import.meta.client
      ? validateId(localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY)
      : DEFAULT_COMPANY
  }),
  getters: {
    company: state => COMPANIES.find(c => c.id === state.currentCompany),
    companies: () => COMPANIES
  },
  actions: {
    setCompany(id) {
      const valid = validateId(id)
      if (valid !== this.currentCompany) {
        this.currentCompany = valid
        localStorage.setItem(STORAGE_KEY, valid)
      }
    }
  }
})

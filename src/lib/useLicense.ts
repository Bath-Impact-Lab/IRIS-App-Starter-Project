import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'

const LICENSE_STORAGE_KEY = 'iris_license_key'

export function useLicense() {
    const licenseKey = ref(localStorage.getItem(LICENSE_STORAGE_KEY) || '')
    const isValid = ref(false)
    const isChecking = ref(false)
    const error = ref<string | null>(null)
    const planType = ref<string | null>(null)

    const validateLicense = async (key: string) => {
        if (!key) {
            error.value = 'License key is required'
            return false
        }

        isChecking.value = true
        error.value = null

        try {
            const cleanKey = key.trim()

            // Join with customers and subscriptions to get plan_type
            const { data, error: sbError } = await supabase
                .from('licenses')
                .select(`
                    is_active,
                    customers (
                        subscriptions (
                            plan_type
                        )
                    )
                `)
                .eq('license_key', cleanKey)
                .maybeSingle()

            if (sbError) throw sbError

            if (!data) {
                error.value = 'Invalid license key'
                isValid.value = false
                planType.value = null
                return false
            }

            if (!data.is_active) {
                error.value = 'License is inactive'
                isValid.value = false
                planType.value = null
                return false
            }

            // Success
            licenseKey.value = cleanKey
            isValid.value = true

            // Extract plan type safely
            const customer = data.customers as any
            const subscription = customer?.subscriptions?.[0]
            planType.value = subscription?.plan_type || 'Trial'

            localStorage.setItem(LICENSE_STORAGE_KEY, cleanKey)
            return true
        } catch (err: any) {
            console.error('License validation error:', err)
            error.value = err.message || 'Failed to validate license'
            isValid.value = false
            planType.value = null
            return false
        } finally {
            isChecking.value = false
        }
    }

    const logout = () => {
        licenseKey.value = ''
        isValid.value = false
        planType.value = null
        localStorage.removeItem(LICENSE_STORAGE_KEY)
    }

    // Auto-validate on mount if key exists
    onMounted(async () => {
        if (licenseKey.value) {
            await validateLicense(licenseKey.value)
        }
    })

    return {
        licenseKey,
        isValid,
        isChecking,
        error,
        planType,
        validateLicense,
        logout
    }
}

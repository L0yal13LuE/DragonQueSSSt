// Authentication.js
// --- supabase authentication --

// Sign in an existing authenticated user
async function signIn(email, password) {
    try {
        const { user, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            console.error('Error signing in:', error.message);
        } else {
            console.log('User signed in:', user);
        }
    } catch (error) {
        console.error('Unexpected error signing in:', error);
    }
}
// select user from test_profiles RLS enabled table
async function getProtectedProfiles() {
    const user = supabase.auth.getUser();
    let isAuthenticated = false;
    user.then((user) => {
        console.log('auth data', user.data);
        if (user.data.user && user.data.role === 'authenticated') isAuthenticated = true;
    });
    // console.log('User is authenticated', user);

    const { data, error } = await supabase
        .from('test_profiles')
        .select('*')

    if (error) {
        console.error('Error fetching profile:', error.message);
        return false;
    } else {
        // console.log('Fetched profile:', data);
        return data;
    }
}

// Create user to test_profiles RLS enabled table
const createUserToTestProfilesTable = async () => {
    const { data, error } = await supabase
        .from('test_profiles')
        .insert({
            name: 'Cat',
            money: 999,
        });
    if (error) {
        console.error('Error creating user:', error.message);
    } else {
        console.log('User created:', data);
    }
}

const supabaseStartAuthen = async () => {
    
    const profileSignIn = await signIn(process.env.SUPABASE_USER_EMAIL, process.env.SUPABASE_USER_PASSWORD);
    console.log('profileSignIn >', profileSignIn);

    const readTestProfile = await getProtectedProfiles();
    console.log('readTestProfile >', readTestProfile);

    await createUserToTestProfilesTable();
}


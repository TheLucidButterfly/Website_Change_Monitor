export interface User {
    email:string,
    email_verified:boolean,
    family_name:string,
    given_name:string,
    isRegistered?:boolean,
    name:string,
    nickname:string,
    picture:string,
    stripeCustomerId:string,
    sub:string,
    updated_at:string,
    usageCount?:number,
    metadata?: any
}
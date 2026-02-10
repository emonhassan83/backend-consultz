import { Stripe as StripeType } from 'stripe'
import config from '../../config'

class StripeService<T> {
  private stripe() {
    return new StripeType(config.stripe?.stripe_api_secret as string, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  }
  private handleError(error: unknown, message: string): never {
    if (error instanceof StripeType.errors.StripeError) {
      console.error('Stripe Error:', error.message)
      throw new Error(`Stripe Error: ${message} - ${error.message}`)
    } else if (error instanceof Error) {
      console.error('Error:', error.message)
      throw new Error(`${message} - ${error.message}`)
    } else {
      // Unknown error types
      console.error('Unknown Error:', error)
      throw new Error(`${message} - An unknown error occurred.`)
    }
  }

  public async connectAccount(
    returnUrl: string,
    refreshUrl: string,
    accountId: string,
  ) {
    try {
      const accountLink = await this.stripe().accountLinks.create({
        account: accountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: 'account_onboarding',
      })
      return accountLink
    } catch (error) {
      this.handleError(error, 'Error connecting account')
    }
  }

  public async createPaymentIntent(
    amount: number,
    currency: string,
    payment_method_types: string[] = ['card'],
  ) {
    try {
      return await this.stripe().paymentIntents.create({
        amount: amount * 100, // Convert amount to cents
        currency,
        payment_method_types,
      })
    } catch (error) {
      this.handleError(error, 'Error creating payment intent')
    }
  }

  public async transfer(
    amount: number,
    accountId: string,
    currency: string = 'usd',
  ) {
    try {
      const balance = await this.stripe().balance.retrieve()
      const availableBalance = balance.available.reduce(
        (total, bal) => total + bal.amount,
        0,
      )
      if (availableBalance < amount) {
        console.log('Insufficient funds to cover the transfer.')
        throw new Error('Insufficient funds to cover the transfer.')
      }
      return await this.stripe().transfers.create({
        amount,
        currency,
        destination: accountId,
      })
    } catch (error) {
      this.handleError(error, 'Error transferring funds')
    }
  }

  public async refund(payment_intent: string, amount: number) {
    try {
      return await this.stripe().refunds.create({
        payment_intent: payment_intent,
        amount: Math.round(amount),
      })
    } catch (error) {
      this.handleError(error, 'Error processing refund')
    }
  }

  public async retrieve(session_id: string) {
    try {
      // return await this.stripe().paymentIntents.retrieve(intents_id);
      return await this.stripe().checkout.sessions.retrieve(session_id)
    } catch (error) {
      this.handleError(error, 'Error retrieving session')
    }
  }

  public async getPaymentStatus(session_id: string) {
    try {
      return (await this.stripe().checkout.sessions.retrieve(session_id)).status
      // return (await this.stripe().paymentIntents.retrieve(intents_id)).status;
    } catch (error) {
      this.handleError(error, 'Error retrieving payment status')
    }
  }

  public async isPaymentSuccess(session_id: string) {
    try {
      const status = (
        await this.stripe().checkout.sessions.retrieve(session_id)
      ).status
      return status === 'complete'
    } catch (error) {
      this.handleError(error, 'Error checking payment success')
    }
  }

  public getStripe() {
    return this.stripe()
  }
}

export default new StripeService()

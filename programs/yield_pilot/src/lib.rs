use anchor_lang::prelude::*;

declare_id!("Hp1uqW9SEVeZfgKzPUkjw1tmsQRpGNgydjXmF6cedry2"); 

#[program]
pub mod yield_pilot {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.current_protocol = 0;
        state.current_apy_bps = 0;
        Ok(())
    }

    pub fn update_yield(
        ctx: Context<UpdateYield>,
        new_protocol: u8,
        new_apy_bps: u16,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;

        require_keys_eq!(
            state.authority,
            ctx.accounts.authority.key(),
            YieldPilotError::Unauthorized
        );

        state.current_protocol = new_protocol;
        state.current_apy_bps = new_apy_bps;

        Ok(())
    }
}

#[account]
pub struct YieldState {
    pub authority: Pubkey,
    pub current_protocol: u8,
    pub current_apy_bps: u16,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 1 + 2)]
    pub state: Account<'info, YieldState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateYield<'info> {
    #[account(mut)]
    pub state: Account<'info, YieldState>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum YieldPilotError {
    #[msg("Unauthorized caller")]
    Unauthorized,
}

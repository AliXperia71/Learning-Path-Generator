from fastapi import APIRouter, Depends, HTTPException, Request

from models.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotUsernameRequest,
    GoogleAuthRequest,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserProfileResponse,
)
from services.auth_service import (
    authenticate_user,
    change_password,
    create_access_token,
    create_reset_token,
    find_user_by_email,
    get_current_user,
    google_sign_in,
    load_user,
    register_user,
    reset_password_with_token,
    update_profile,
)
from services.email_service import send_password_reset, send_username_reminder
from services.rate_limit import (
    AUTH_FORGOT_LIMIT,
    AUTH_GOOGLE_LIMIT,
    AUTH_LOGIN_LIMIT,
    AUTH_REGISTER_LIMIT,
    AUTH_RESET_LIMIT,
    PROFILE_UPDATE_LIMIT,
    limiter,
    user_or_ip_key,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Recovery endpoints answer identically whether or not the account exists, so a
# stranger can't use them to discover which addresses are registered.
RECOVERY_ACK = {"message": "If that email is registered, we've sent it instructions."}


@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit(AUTH_REGISTER_LIMIT)
def register(request: Request, payload: RegisterRequest) -> AuthResponse:
    try:
        user = register_user(payload.email, payload.username, payload.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return AuthResponse(
        access_token=create_access_token(user["id"]),
        email=user["email"],
        username=user["username"],
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit(AUTH_LOGIN_LIMIT)
def login(request: Request, payload: LoginRequest) -> AuthResponse:
    user = authenticate_user(payload.identifier, payload.password)
    # Same message for unknown account vs wrong password — don't leak which exist
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")

    return AuthResponse(
        access_token=create_access_token(user["id"]),
        email=user["email"],
        username=user["username"],
    )


@router.post("/google", response_model=AuthResponse)
@limiter.limit(AUTH_GOOGLE_LIMIT)
def google_auth(request: Request, payload: GoogleAuthRequest) -> AuthResponse:
    try:
        user = google_sign_in(payload.credential)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    return AuthResponse(
        access_token=create_access_token(user["id"]),
        email=user["email"],
        username=user["username"],
    )


# ============================== Recovery ==============================

@router.post("/forgot-password")
@limiter.limit(AUTH_FORGOT_LIMIT)
def forgot_password(request: Request, payload: ForgotPasswordRequest) -> dict:
    user = find_user_by_email(payload.email)
    if user:
        token = create_reset_token(user["id"], user["password_hash"])
        send_password_reset(user["email"], token)
    return RECOVERY_ACK


@router.post("/forgot-username")
@limiter.limit(AUTH_FORGOT_LIMIT)
def forgot_username(request: Request, payload: ForgotUsernameRequest) -> dict:
    user = find_user_by_email(payload.email)
    if user:
        send_username_reminder(user["email"], user["username"])
    return RECOVERY_ACK


@router.post("/reset-password")
@limiter.limit(AUTH_RESET_LIMIT)
def reset_password(request: Request, payload: ResetPasswordRequest) -> dict:
    try:
        reset_password_with_token(payload.token, payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Password updated. You can sign in with it now."}


# ============================== Profile ==============================

@router.get("/me", response_model=UserProfileResponse)
def me(user: dict = Depends(get_current_user)) -> UserProfileResponse:
    profile = load_user(user["id"])
    if profile is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    return UserProfileResponse(**profile)


@router.patch("/me", response_model=UserProfileResponse)
@limiter.limit(PROFILE_UPDATE_LIMIT, key_func=user_or_ip_key)
def update_me(
    request: Request,
    payload: ProfileUpdateRequest,
    user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    try:
        profile = update_profile(
            user["id"], username=payload.username, email=payload.email, bio=payload.bio
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return UserProfileResponse(**profile)


@router.post("/change-password")
@limiter.limit(PROFILE_UPDATE_LIMIT, key_func=user_or_ip_key)
def change_my_password(
    request: Request,
    payload: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    try:
        change_password(user["id"], payload.current_password, payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Password updated."}

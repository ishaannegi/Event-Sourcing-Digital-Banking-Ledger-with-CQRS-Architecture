package com.bank.ledger.auth;

import com.bank.ledger.api.DTOs;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@Tag(name = "Authentication", description = "Endpoints for user login and JWT token generation")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtTokenProvider tokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }

    @Operation(
            summary = "Authenticate user and issue JWT token",
            description = "Verifies username and password against BCrypt hashed credentials. Returns a signed JWT token on success."
    )
    @ApiResponse(responseCode = "200", description = "Authentication successful - JWT token returned")
    @ApiResponse(responseCode = "401", description = "Invalid username or password")
    @PostMapping("/login")
    public ResponseEntity<DTOs.LoginResponse> login(@Valid @RequestBody DTOs.LoginRequest request) {
        UserEntity user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new BadCredentialsException("Invalid username or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid username or password");
        }

        String token = tokenProvider.generateToken(user.getUsername(), user.getRole());
        return ResponseEntity.ok(new DTOs.LoginResponse(token, user.getUsername(), user.getRole()));
    }

    @Operation(
            summary = "Register a new user account",
            description = "Creates a new user account with BCrypt hashed password and issues a signed JWT token."
    )
    @ApiResponse(responseCode = "201", description = "Registration successful - JWT token returned")
    @ApiResponse(responseCode = "400", description = "Username already taken or invalid input")
    @PostMapping("/register")
    public ResponseEntity<DTOs.LoginResponse> register(@Valid @RequestBody DTOs.RegisterRequest request) {
        if (userRepository.findByUsername(request.username().trim()).isPresent()) {
            throw new IllegalArgumentException("Username '" + request.username().trim() + "' is already taken.");
        }

        String role = (request.role() != null && request.role().trim().equalsIgnoreCase("ADMIN")) ? "ADMIN" : "CUSTOMER";
        String encodedPassword = passwordEncoder.encode(request.password());

        UserEntity user = new UserEntity(request.username().trim(), encodedPassword, role);
        userRepository.save(user);

        String token = tokenProvider.generateToken(user.getUsername(), user.getRole());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new DTOs.LoginResponse(token, user.getUsername(), user.getRole()));
    }
}


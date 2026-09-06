package com.bank.ledger.auth;

import com.bank.ledger.api.DTOs;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class CustomAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handle(HttpServletRequest request,
                       HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException, ServletException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.FORBIDDEN.value(),
                "Forbidden",
                accessDeniedException.getMessage() != null ? accessDeniedException.getMessage() : "Access denied: insufficient permissions or account ownership mismatch.",
                System.currentTimeMillis()
        );

        response.getWriter().write(objectMapper.writeValueAsString(error));
    }
}

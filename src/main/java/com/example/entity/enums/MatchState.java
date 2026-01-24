package com.example.entity.enums;

public enum MatchState {
    SCHEDULED,
    LIVE,
    FINISHED,
    LOCKED;

    public boolean canTransitionTo(MatchState nextState) {
        return switch (this) {
            case SCHEDULED -> nextState == LIVE;
            case LIVE -> nextState == FINISHED;
            case FINISHED -> nextState == LOCKED;
            case LOCKED -> false;
        };
    }
}
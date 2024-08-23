FROM public.ecr.aws/lambda/python:3.12

<<<<<<< HEAD
ENV POETRY_NO_INTERACTION=1 \
  POETRY_VIRTUALENVS_CREATE=false \
  POETRY_CACHE_DIR='/var/cache/pypoetry' \
  POETRY_HOME='/usr/local' \
  POETRY_VERSION=1.8.3

# System deps:
RUN curl -sSL https://install.python-poetry.org | python3 -

# Copy dependency files
COPY poetry.lock pyproject.toml ${LAMBDA_TASK_ROOT}

# Install the specified packages
RUN poetry install --only=main --no-interaction --no-ansi
=======
# Copy requirements.txt
COPY pyproject.toml ${LAMBDA_TASK_ROOT}
COPY poetry.lock ${LAMBDA_TASK_ROOT}

# Install the specified packages
RUN poetry install
>>>>>>> 5999f59 (dockerfile)

# Copy function code
COPY stats_lambda/get_stats.py ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
<<<<<<< HEAD
CMD [ "get_stats.handler" ]
=======
CMD [ "lambda_function.handler" ]
>>>>>>> 5999f59 (dockerfile)
